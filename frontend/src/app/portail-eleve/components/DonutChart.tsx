'use client';

import React from 'react';

interface DonutChartProps {
    pct: number;
    color: string;
    value: string;
    label: string;
    size?: number;
}

export default function DonutChart({ pct, color, value, label, size = 90 }: DonutChartProps) {
    const radius = (size - 10) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (Math.min(pct, 100) / 100) * circumference;

    return (
        <div style={{ position: 'relative', width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {/* Background circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="#f1f5f9"
                    strokeWidth="7"
                />
                {/* Progress circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
            </svg>
            <div 
                style={{ 
                    position: 'absolute', 
                    inset: 0, 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center' 
                }}
            >
                <span style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{value}</span>
                <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>{label}</span>
            </div>
        </div>
    );
}
