"""
Conversion des valeurs d'une ligne vers JSON et retour, selon le type de la
colonne. Sert au transfert cloud → poste (et plus tard poste → cloud).

Le JSON ne connaît ni les dates, ni les montants exacts, ni les binaires : on
les transporte en texte (ISO 8601, chaîne décimale, base64) et on les
reconstitue d'après le type déclaré de la colonne, jamais en devinant.
"""
import base64
import datetime as dt
from decimal import Decimal

from sqlalchemy import Column, Table
from sqlalchemy import types as sa


def encoder(colonne: Column, valeur):
    if valeur is None:
        return None
    if isinstance(valeur, (dt.datetime, dt.date, dt.time)):
        return valeur.isoformat()
    if isinstance(valeur, Decimal):
        return str(valeur)
    if isinstance(valeur, (bytes, bytearray, memoryview)):
        return base64.b64encode(bytes(valeur)).decode("ascii")
    return valeur


def decoder(colonne: Column, valeur):
    if valeur is None:
        return None
    t = colonne.type
    if isinstance(t, sa.DateTime):
        return dt.datetime.fromisoformat(valeur)
    if isinstance(t, sa.Date):
        return dt.date.fromisoformat(valeur)
    if isinstance(t, sa.Time):
        return dt.time.fromisoformat(valeur)
    if isinstance(t, sa.Numeric) and not isinstance(t, sa.Float):
        return Decimal(str(valeur))
    if isinstance(t, sa.LargeBinary):
        return base64.b64decode(valeur)
    return valeur


def ligne_vers_json(table: Table, ligne) -> dict:
    return {c.name: encoder(c, ligne[c.name]) for c in table.columns}


def ligne_depuis_json(table: Table, donnees: dict) -> dict:
    # Une colonne inconnue (cloud plus récent que le poste) est ignorée : le
    # poste n'a pas encore cette colonne, il la recevra à sa mise à jour.
    return {c.name: decoder(c, donnees[c.name]) for c in table.columns if c.name in donnees}
