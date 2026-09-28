"use client";

import React, { useState } from 'react';

interface HeatmapData {
  date: string; // YYYY-MM-DD
  count: number;
}

export function ActivityHeatmap({ data, label }: { data: HeatmapData[], label?: string }) {
  const [hoveredCell, setHoveredCell] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  // Generate 91 days (13 weeks) ending today
  const today = new Date();
  const days: { date: Date; dateStr: string; count: number }[] = [];
  
  // Create lookup map
  const dataMap = new Map(data.map(d => [d.date, d.count]));

  for (let i = 90; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    days.push({
      date: d,
      dateStr,
      count: dataMap.get(dateStr) || 0
    });
  }

  // Group by week (column)
  const weeks: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const getIntensityClass = (count: number) => {
    if (count === 0) return 'bg-surface-container';
    if (count <= 2) return 'bg-primary/20';
    if (count <= 5) return 'bg-primary/40';
    if (count <= 10) return 'bg-primary/70';
    return 'bg-primary text-white';
  };

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Calculate month labels (simplified)
  const monthLabels: { month: string; colIndex: number }[] = [];
  let currentMonth = -1;
  weeks.forEach((week, index) => {
    const weekMonth = week[0].date.getMonth();
    if (weekMonth !== currentMonth) {
      monthLabels.push({ month: months[weekMonth], colIndex: index });
      currentMonth = weekMonth;
    }
  });

  return (
    <div className="relative font-body">
      {label && <h3 className="text-sm font-medium text-on-surface-variant mb-4">{label}</h3>}
      
      <div className="flex gap-2 relative overflow-x-auto pb-4">
        {/* Day labels */}
        <div className="flex flex-col gap-[4px] pt-6 pr-2 text-[10px] text-on-surface-variant justify-between h-[112px] sticky left-0 bg-surface-container-lowest z-10">
          <span className="leading-[12px] opacity-0">S</span>
          <span className="leading-[12px]">M</span>
          <span className="leading-[12px] opacity-0">T</span>
          <span className="leading-[12px]">W</span>
          <span className="leading-[12px] opacity-0">T</span>
          <span className="leading-[12px]">F</span>
          <span className="leading-[12px] opacity-0">S</span>
        </div>

        <div className="flex flex-col gap-2 min-w-max">
          {/* Month labels */}
          <div className="flex relative h-4 w-full">
            {monthLabels.map((ml, i) => (
              <span 
                key={i} 
                className="absolute text-[10px] text-on-surface-variant"
                style={{ left: `${ml.colIndex * 16}px` }}
              >
                {ml.month}
              </span>
            ))}
          </div>

          {/* Grid */}
          <div className="flex gap-[4px]">
            {weeks.map((week, wIndex) => (
              <div key={wIndex} className="flex flex-col gap-[4px]">
                {week.map((day, dIndex) => (
                  <div
                    key={day.dateStr}
                    className={`w-3 h-3 rounded-[2px] cursor-pointer transition-colors ${getIntensityClass(day.count)}`}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredCell({
                        date: day.dateStr,
                        count: day.count,
                        x: rect.left,
                        y: rect.top
                      });
                    }}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-4 text-[10px] text-on-surface-variant">
        <span>Less</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-[2px] bg-surface-container" />
          <div className="w-3 h-3 rounded-[2px] bg-primary/20" />
          <div className="w-3 h-3 rounded-[2px] bg-primary/40" />
          <div className="w-3 h-3 rounded-[2px] bg-primary/70" />
          <div className="w-3 h-3 rounded-[2px] bg-primary" />
        </div>
        <span>More</span>
      </div>

      {/* Tooltip */}
      {hoveredCell && (
        <div 
          className="fixed z-50 bg-primary text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full mt-[-8px]"
          style={{ left: hoveredCell.x + 6, top: hoveredCell.y }}
        >
          <strong>{hoveredCell.count}</strong> questions on {hoveredCell.date}
        </div>
      )}
    </div>
  );
}
