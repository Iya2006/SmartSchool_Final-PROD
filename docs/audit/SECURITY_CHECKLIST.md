# SECURITY_CHECKLIST.md — SMART_SCHOOL_FINAL (MultiTenant + HighPerformance)

## 🔐 Sécurité Production — Checklist Complète

### 1️⃣ GESTION DES SECRETS

#### ✅ Actuellement fait
- `.env.example` créé (sans secrets)
- `docker-compose.prod.yml` utilise Docker Secrets
- Fichiers `.env` dans `.gitignore`

#### 📋 À faire en PRODUCTION
```bash
# 1. Générer les secrets (ne JAMAIS les hardcoder)
mkdir -p ./secrets
chmod 700 ./secrets

# Générer des clés cryptographiquement sûres
python3 -c "import secrets; print(secrets.token_urlsafe(50))" > ./secrets/jwt_secret.txt
python3 -c "import secrets; print(secrets.token_urlsafe(50))" > ./secrets/db_password.txt
python3 -c "import secrets; print(secrets.token_urlsafe(32))" > ./secrets/redis_password.txt
python3 -c "import secrets; print(secrets.token_urlsafe(32))" > ./secrets/minio_password.txt
python3 -c "import secrets; print(secrets.token_urlsafe(32))" > ./secrets/keycloak_password.txt

chmod 600 ./secrets/*.txt
```

#### 🚨 JAMAIS faire
- ❌ Hardcoder les secrets dans Dockerfile
- ❌ Commiter `.env` dans Git
- ❌ Utiliser des mots de passe par défaut
- ❌ Stocker les secrets en clair dans les variables
- ❌ Utiliser les mêmes secrets en dev et prod

---

### 2️⃣ IMAGES DOCKER — PERFORMANCE + SÉCURITÉ

#### ✅ Pratiques sécurisées (implémentées)
- ✅ Multi-stage build (optimisation taille)
- ✅ Utilisateur non-root (`appuser:appuser`)
- ✅ Images Alpine slim (surface d'attaque minimale)
- ✅ Health checks
- ✅ Logging structuré

#### 📋 À faire en PRODUCTION
```bash
# 1. Scanner les vulnérabilités
docker scout cves smartschool_fastapi:prod

# 2. Nettoyage des images non utilisées
docker image prune -a --filter "until=720h"

# 3. Utiliser Docker Hardened Images (DHI) pour plus de sécurité
```

---

### 3️⃣ PERFORMANCE & SCALING (CRITIQUE pour multi-tenants)

#### ✅ Configurations actuelles
- ✅ 4 workers Uvicorn (haute concurrence)
- ✅ Redis caching (maxmemory LRU)
- ✅ Connection pooling PostgreSQL
- ✅ Limite de ressources CPU/Memory

#### 📋 À faire en PRODUCTION

**A. Scaling horizontal (réplicas)**
```yaml
deploy:
  replicas: 3  # Déployer 3 instances de l'API
  update_config:
    parallelism: 1
    delay: 10s
  restart_policy:
    condition: on-failure
    max_attempts: 3
```

**B. Load balancer (Nginx/HAProxy)**
```nginx
upstream smartschool_api {
    server smartschool_api_1:8500;
    server smartschool_api_2:8500;
    server smartschool_api_3:8500;
}

server {
    listen 80;
    server_name smartschool.example.com;

    location / {
        proxy_pass http://smartschool_api;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

**C. Caching stratégies**
```python
# FastAPI + Redis caching
from functools import lru_cache
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.get("/schools/{school_id}")
@limiter.limit("100/minute")  # Rate limiting
async def get_school(school_id: int):
    # Implémenter du caching Redis
    cache_key = f"school:{school_id}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)
    
    school = await db.get_school(school_id)
    await redis.setex(cache_key, 3600, json.dumps(school))
    return school
```

**D. Connection pooling PostgreSQL**
```python
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,           # Connexions maintenues
    max_overflow=10,        # Connexions additionnelles si besoin
    pool_recycle=3600,      # Recycler toutes les heures
    echo=False
)
```

---

### 4️⃣ DONNÉES PERSONNELLES (RGPD/GDPR COMPLIANCE)

#### 🚨 CRITIQUE : SMART_SCHOOL stocke des données sensibles d'enfants
- Noms, prénoms
- Dates de naissance
- Adresses
- Numéros de téléphone parents
- Photos (potentiellement)
- Résultats scolaires
- Allergies/infos médicales

#### 📋 Obligations légales (Guinée + CEDEAO ❓)

**1. Consentement parental**
```python
# Ajouter dans la base:
class StudentConsent(models.Model):
    student = ForeignKey(Student)
    parent = ForeignKey(Parent)
    consent_type = CharField(choices=[
        'DATA_PROCESSING',
        'PHOTO_USAGE',
        'EMAIL_COMMUNICATION'
    ])
    given_at = DateTimeField(auto_now_add=True)
    ip_address = GenericIPAddressField()  # Traçabilité
    document = FileField()  # PDF signé
```

**2. Droit à l'oubli**
```python
@app.delete("/students/{student_id}")
async def delete_student(student_id: int):
    # Hard delete ou soft delete avec GDPR compliance
    student = await db.get_student(student_id)
    
    # Option 1: Soft delete (recommandé)
    await db.update_student(student_id, {
        'deleted_at': datetime.now(),
        'name': '[SUPPRIMÉ]',
        'email': None,
        'phone': None
    })
    
    # Option 2: Hard delete (difficile à annuler)
    await db.delete_student(student_id)
    
    # Créer une trace d'audit
    await db.log_event(
        event_type='DATA_DELETION',
        user_id=current_user.id,
        target_id=student_id,
        timestamp=datetime.now()
    )
```

**3. Chiffrement des données sensibles**
```python
from cryptography.fernet import Fernet

ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')
cipher = Fernet(ENCRYPTION_KEY)

# Stocker les données sensibles chiffrées
encrypted_phone = cipher.encrypt(parent.phone.encode())
db.save(PhoneEncrypted(value=encrypted_phone))

# Décrypter à la demande
decrypted = cipher.decrypt(encrypted_phone).decode()
```

**4. Audit logging obligatoire**
```python
# Table d'audit pour tracer qui fait quoi
class AuditLog(models.Model):
    timestamp = DateTimeField(auto_now_add=True)
    user_id = IntegerField()
    action = CharField()  # CREATE, READ, UPDATE, DELETE
    resource_type = CharField()  # student, parent, grade
    resource_id = IntegerField()
    old_value = JSONField(null=True)
    new_value = JSONField(null=True)
    ip_address = GenericIPAddressField()
    user_agent = TextField()
```

---

### 5️⃣ MULTI-TENANCY SECURITY (Isolation des écoles)

#### ⚠️ RISQUE CRITIQUE: Une école ne doit PAS voir les données d'une autre

#### ✅ Implémentation sécurisée
```python
# Middleware pour injecter le tenant_id
@app.middleware("http")
async def add_tenant_context(request: Request, call_next):
    # Récupérer le tenant depuis le JWT
    token = request.headers.get("Authorization")
    payload = jwt.decode(token, JWT_SECRET)
    tenant_id = payload.get("tenant_id")
    
    # Injecter dans le contexte
    request.state.tenant_id = tenant_id
    response = await call_next(request)
    return response

# Dans chaque endpoint, filtrer par tenant_id
@app.get("/students")
async def list_students(request: Request):
    tenant_id = request.state.tenant_id
    
    # CRITIQUE: TOUJOURS filtrer par tenant_id
    students = await db.query(Student).filter(
        Student.school_id == tenant_id
    ).all()
    
    return students
```

#### 🚨 Erreurs à éviter
```python
# ❌ DANGER: Pas de filtrage par tenant
@app.get("/students")
async def get_students():
    return db.query(Student).all()  # Retourne TOUS les étudiants de TOUTES les écoles!

# ✅ CORRECT: Filtrage par tenant obligatoire
@app.get("/students")
async def get_students(request: Request):
    tenant_id = request.state.tenant_id
    return db.query(Student).filter(Student.school_id == tenant_id).all()
```

---

### 6️⃣ AUTHENTIFICATION & AUTORISATION

#### ✅ Implémentation recommandée
```python
# 1. JWT avec expiration courte
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 15  # Court
JWT_REFRESH_TOKEN_EXPIRE_DAYS = 7     # Plus long

# 2. Refresh token rotation
# À chaque refresh, générer un nouveau pair (access + refresh)

# 3. RBAC (Role-Based Access Control)
class Role(str, Enum):
    ADMIN = "admin"           # Rectorat
    SCHOOL_ADMIN = "school_admin"  # Principal école
    TEACHER = "teacher"
    PARENT = "parent"
    STUDENT = "student"

# 4. Vérification stricte des permissions
@app.get("/schools/{school_id}")
async def get_school(school_id: int, current_user: User = Depends(get_current_user)):
    # Vérifier l'accès: l'utilisateur peut-il accéder à cette école?
    if current_user.role == Role.ADMIN:
        return db.get_school(school_id)  # Admin peut tout voir
    
    if current_user.school_id != school_id:
        raise HTTPException(status_code=403, detail="Forbidden")  # Sinon, accès refusé
    
    return db.get_school(school_id)
```

---

### 7️⃣ API SECURITY & RATE LIMITING

#### Protéger contre les attaques
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# Rate limiting par IP
@app.post("/login")
@limiter.limit("5/minute")  # Max 5 tentatives/min
async def login(credentials: LoginRequest):
    # Vérifier les credentials
    pass

# Rate limiting par utilisateur
@app.post("/api/grades")
@limiter.limit("100/hour")  # Max 100 requêtes/heure
async def create_grade(grade: Grade):
    pass
```

#### Validation stricte des inputs
```python
from pydantic import BaseModel, validator, EmailStr

class StudentCreate(BaseModel):
    first_name: str  # Requis
    last_name: str
    email: EmailStr  # Validation email
    phone: str
    birth_date: date
    
    @validator('first_name', 'last_name')
    def non_empty(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError('Cannot be empty')
        return v
    
    @validator('birth_date')
    def reasonable_birthdate(cls, v):
        if v > date.today():
            raise ValueError('Birth date cannot be in the future')
        if (date.today() - v).days > 120 * 365:
            raise ValueError('Age is unreasonable')
        return v
```

---

### 8️⃣ INFRASTRUCTURE SECURITY

#### A. Conteneurs en PROD
```yaml
# Sécurité maximale
read_only: true           # Filesystem en lecture seule
tmpfs:
  - /tmp                  # Répertoire temporaire en mémoire
privileged: false         # Pas de privilèges root
cap_drop:
  - ALL                   # Supprimer toutes les capacités
cap_add:
  - NET_BIND_SERVICE      # Ajouter seulement ce qui est nécessaire
```

#### B. Réseau
```bash
# Reverse proxy (Nginx) obligatoire
# - HTTPS/TLS
# - WAF (Web Application Firewall)
# - Rate limiting
# - CORS restrictif

# Firewall système
sudo ufw default deny incoming
sudo ufw allow 22/tcp      # SSH (changez le port en prod!)
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable
```

#### C. PostgreSQL sécurisé
```conf
# postgresql.conf
ssl = on
ssl_cert_file = '/certs/server.crt'
ssl_key_file = '/certs/server.key'
password_encryption = scram-sha-256

# Audit logging
log_connections = on
log_disconnections = on
log_duration = on
log_min_duration_statement = 1000  # Log requêtes > 1s

# Sécurité
shared_preload_libraries = 'pg_stat_statements,pgaudit'
```

#### D. Redis sécurisé
```bash
# redis.conf
requirepass your_secure_password_here
maxmemory 512mb
maxmemory-policy allkeys-lru
```

---

### 9️⃣ MONITORING & ALERTES

#### Métriques CRITIQUES (pour multi-tenant)
```
- Latence des requêtes par tenant (certaines écoles plus lentes?)
- Taux d'erreur par tenant
- Connexions DB par tenant
- Cache hit/miss ratio Redis
- Taille des données par tenant (quota enforcement)
- Tentatives de login échouées (brute force?)
- Requêtes non autorisées (403 errors)
```

#### Setup Prometheus + Grafana
```bash
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'smartschool_api'
    static_configs:
      - targets: ['localhost:8000']
  - job_name: 'postgresql'
    static_configs:
      - targets: ['localhost:5432']
  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:6379']
```

---

### 🔟 SAUVEGARDES & DISASTER RECOVERY

#### Stratégie 3-2-1 pour chaque tenant
```bash
# Backup journaliers chiffrés
pg_dump -Fc relations_db | gpg --symmetric > backup_$(date +%Y%m%d).sql.gpg

# Sync vers cloud (AWS S3, GCP GCS, etc.)
aws s3 sync ./backups s3://my-bucket/smartschool_backups/ --sse AES256

# Tester les restaurations mensuellement
```

#### RTO/RPO (Recovery objectives)
```
RTO (Recovery Time Objective): Combien de temps pour redevenir opérationnel?
RPO (Recovery Point Objective): Quel délai acceptable de perte de données?

Pour SMART_SCHOOL:
- RTO: < 1 heure  (les écoles doivent reprendre rapidement)
- RPO: < 1 heure  (perdre max 1h de données)
```

---

### 1️⃣1️⃣ PERFORMANCE TESTING (AvantProduction)

#### Load testing avec k6/Locust
```python
# locustfile.py
from locust import HttpUser, task, between

class SchoolUser(HttpUser):
    wait_time = between(1, 3)
    
    @task
    def get_students(self):
        self.client.get("/students", headers={"Authorization": f"Bearer {self.token}"})
    
    @task
    def create_grade(self):
        self.client.post("/grades", json={
            "student_id": 1,
            "subject": "Math",
            "score": 95
        })
```

```bash
# Lancer le test
locust -f locustfile.py -u 100 -r 10 -t 10m --host=http://localhost:8500
# 100 utilisateurs, spawn rate 10/s, durée 10 minutes
```

---

### 1️⃣2️⃣ CHECKLIST FINALE PRODUCTION

**Secrets & Configuration**
- [ ] Secrets générés et dans `/secrets`
- [ ] `.env` jamais commité
- [ ] Variables d'environnement pour chaque environnement (dev/staging/prod)

**Images & Conteneurs**
- [ ] Dockerfile.prod multi-stage + non-root
- [ ] Scans CVE avec Docker Scout (0 critiques)
- [ ] Image size < 500MB (optimisé)
- [ ] Health checks configurés

**Données & Sécurité**
- [ ] RGPD compliance (consentement, droit à l'oubli)
- [ ] Multi-tenancy avec isolation stricte
- [ ] Chiffrement des données sensibles
- [ ] Audit logging de toutes les modifications

**Réseau & Infrastructure**
- [ ] Reverse proxy (Nginx/Caddy) + HTTPS/TLS
- [ ] Firewall restrictif (ports 22, 80, 443 uniquement)
- [ ] PostgreSQL SSL + sécurité
- [ ] Redis avec mot de passe + maxmemory

**Performance & Scaling**
- [ ] Load balancer avec 3+ réplicas API
- [ ] Connection pooling DB configuré
- [ ] Redis caching stratégies implémentées
- [ ] Rate limiting par IP et par utilisateur

**Monitoring & Alertes**
- [ ] Prometheus + Grafana ou cloud monitoring
- [ ] Alertes sur: CPU, mémoire, erreurs, latence, quota tenants
- [ ] Logs centralisés (ELK ou cloud)

**Sauvegardes & Récupération**
- [ ] Backups journaliers chiffrés
- [ ] Backups vers cloud
- [ ] Restaurations testées mensuellement
- [ ] RTO/RPO documentés

**Conformité & Documentation**
- [ ] Politique de sécurité documentée
- [ ] Runbook pour incidents
- [ ] Équipe sensibilisée à la sécurité
- [ ] Plan de continuité de service (BCP)

---

## 📞 Ressources

- https://docs.docker.com/engine/security/
- https://gdpr.eu/
- https://owasp.org/www-project-top-ten/
- https://fastapi.tiangolo.com/tutorial/security/
- https://www.postgresql.org/docs/current/sql-syntax.html
