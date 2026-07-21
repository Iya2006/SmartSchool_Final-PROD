# SMARTSCHOOL - ENGINEERING STANDARDS

Version: Production
Status: Mandatory
Applies to: Entire Project

---

# OBJECTIVE

SmartSchool is a production-grade school management platform expected to support thousands of users.

Every implementation must prioritize:

1. Security
2. Reliability
3. Performance
4. Scalability
5. Maintainability
6. User Experience
7. Accessibility
8. Code Quality

---

# TECHNOLOGY STACK

Frontend:
- Next.js 16
- React 19
- TypeScript
- Framer Motion
- Axios
- Recharts
- jsPDF
- html2canvas

Backend:
- FastAPI
- SQLAlchemy
- PostgreSQL
- Alembic
- Pydantic
- JWT
- Passlib
- SlowAPI

Database:
- PostgreSQL
- SQLite (testing only)

---

# ENGINEERING PRINCIPLES

Mandatory:

- SOLID
- DRY
- KISS
- Separation of Concerns
- Clean Architecture
- Defensive Programming
- Fail Fast Principle

Forbidden:

- Spaghetti Code
- Duplicate Logic
- Dead Code
- Hardcoded Secrets
- Unvalidated Inputs

---

# SECURITY STANDARDS

Mandatory verification:

## Authentication

Always verify:

- JWT expiration
- Token validation
- Session invalidation
- Refresh token security
- Password hashing

Passwords must always use bcrypt.

Plain text passwords are forbidden.

---

## Authorization

Every route must verify:

- Role
- Permission
- Ownership

No user may access resources outside their authorization scope.

---

## OWASP TOP 10

Must be checked continuously:

- Broken Access Control
- Cryptographic Failures
- Injection
- Insecure Design
- Security Misconfiguration
- Vulnerable Components
- Authentication Failures
- Data Integrity Failures
- Logging Failures
- SSRF

---

## API Security

Every API endpoint must:

- Validate inputs
- Validate outputs
- Handle exceptions
- Log failures
- Apply rate limiting where needed

---

## File Upload Security

Always verify:

- MIME type
- Extension
- Maximum size
- Filename sanitization

Never trust client-side validation.

---

# DATABASE STANDARDS

PostgreSQL is the production database.

Always:

- Use indexes
- Avoid N+1 queries
- Optimize joins
- Paginate large datasets
- Validate migrations

Never:

- Use raw SQL without justification
- Build SQL strings manually

---

# FASTAPI STANDARDS

Routes must remain thin.

Architecture:

Route
→ Service
→ Repository
→ Database

Business logic inside routes is forbidden.

---

# TYPESCRIPT STANDARDS

Strict typing required.

Forbidden:

any

unless justified.

All interfaces must be documented.

---

# FRONTEND STANDARDS

Must be:

- Responsive
- Accessible
- Mobile-first
- Consistent

All forms must:

- Validate data
- Display clear errors
- Prevent invalid submissions

---

# UI/UX RULES

Every screen must:

- Have clear hierarchy
- Have consistent spacing
- Have consistent colors
- Have loading states
- Have empty states
- Have error states

No unfinished interface may be considered complete.

---

# PERFORMANCE RULES

Must verify:

- Query performance
- API latency
- Bundle size
- Rendering performance

Always prefer efficient algorithms.

---

# QR CODE SECURITY

QR codes must:

- Be unique
- Be verifiable
- Prevent spoofing

Sensitive QR codes should use signed tokens.

---

# PDF GENERATION

Must verify:

- Pagination
- A4 compatibility
- Print compatibility
- Logo rendering
- Signature rendering

---

# TESTING POLICY

No feature is complete until:

- Code compiles
- Tests pass
- Permissions are verified
- Edge cases are tested
- Errors are handled

Frontend:
- Vitest

Backend:
- Pytest

---

# DOCUMENTATION POLICY

Every important feature must include:

- Technical explanation
- Usage instructions
- API documentation

---

# CODE REVIEW POLICY

After every implementation:

1. Review code.
2. Review security.
3. Review performance.
4. Review architecture.
5. Review maintainability.
6. Review UI/UX.
7. Review test coverage.

Provide improvements before final validation.

---

# PRODUCTION READINESS

Before marking a task complete:

Security Review ✓
Performance Review ✓
Architecture Review ✓
Testing Review ✓
UI Review ✓
Documentation Review ✓

Otherwise:

TASK NOT COMPLETE