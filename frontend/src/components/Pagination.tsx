'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
    page: number;          // page courante, 1-indexed
    pageSize: number;
    total: number;         // total de résultats (depuis X-Total-Count)
    onPageChange: (page: number) => void;
}

function getPageNumbers(page: number, totalPages: number): (number | 'ellipsis')[] {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
    const sorted = [...pages].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);

    const result: (number | 'ellipsis')[] = [];
    let prev: number | null = null;
    for (const p of sorted) {
        if (prev !== null && p - prev > 1) result.push('ellipsis');
        result.push(p);
        prev = p;
    }
    return result;
}

export default function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);

    const canPrev = page > 1;
    const canNext = page < totalPages;

    const pageNumbers = getPageNumbers(page, totalPages);

    const navBtnStyle = (disabled: boolean): React.CSSProperties => ({
        padding: '6px 10px',
        borderRadius: 6,
        border: '1px solid #e2e8f0',
        background: disabled ? '#f8fafc' : '#fff',
        color: disabled ? '#cbd5e1' : '#334155',
        fontSize: 13,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
    });

    const pageBtnStyle = (active: boolean): React.CSSProperties => ({
        minWidth: 30,
        height: 30,
        padding: '0 6px',
        borderRadius: 6,
        border: active ? '1px solid #3b82f6' : '1px solid #e2e8f0',
        background: active ? '#3b82f6' : '#fff',
        color: active ? '#fff' : '#334155',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
    });

    if (total === 0) return null;

    return (
        <div
            style={{
                padding: '12px 20px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                fontSize: 13,
                color: '#64748b',
            }}
        >
            <span>
                Affichage <strong style={{ color: '#334155' }}>{start}–{end}</strong> sur{' '}
                <strong style={{ color: '#334155' }}>{total}</strong> résultats
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                    type="button"
                    onClick={() => canPrev && onPageChange(page - 1)}
                    disabled={!canPrev}
                    style={navBtnStyle(!canPrev)}
                >
                    <ChevronLeft size={14} /> Précédent
                </button>

                {pageNumbers.map((p, idx) =>
                    p === 'ellipsis' ? (
                        <span key={`ellipsis-${idx}`} style={{ padding: '0 4px', color: '#94a3b8' }}>
                            …
                        </span>
                    ) : (
                        <button
                            key={p}
                            type="button"
                            onClick={() => onPageChange(p)}
                            style={pageBtnStyle(p === page)}
                        >
                            {p}
                        </button>
                    )
                )}

                <button
                    type="button"
                    onClick={() => canNext && onPageChange(page + 1)}
                    disabled={!canNext}
                    style={navBtnStyle(!canNext)}
                >
                    Suivant <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
}
