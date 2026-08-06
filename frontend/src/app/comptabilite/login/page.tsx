'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * L'ancienne page de connexion dédiée à la Comptabilité (PIN + compte
 * "Comptable" séparé) a été retirée : elle créait une double session en
 * parallèle du JWT principal SmartSchool, ce qui fragilisait l'authentification
 * globale (voir .ai/CURRENT_TASK.md). L'accès au module Comptabilité passe
 * désormais uniquement par la connexion principale (/login) avec un compte
 * ayant le rôle COMPTABLE ou un rôle de direction (ADMIN/DG/FONDATEUR).
 *
 * Cette page ne fait plus que rediriger, pour ne pas casser d'éventuels
 * liens/favoris existants vers /comptabilite/login.
 */
export default function ComptabiliteLoginRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/login');
    }, [router]);

    return null;
}
