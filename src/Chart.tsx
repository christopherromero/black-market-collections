import { useEffect, useRef } from 'react'
import { init, use as registerECharts } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { money } from './domain'

registerECharts([LineChart, GridComponent, TooltipComponent, AriaComponent, SVGRenderer])

export default function Trend({ points, label }: { points: { date: string; cents: number | null }[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const chart = init(ref.current, undefined, { renderer: 'svg' })
    chart.setOption({
      animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      aria: { enabled: true, description: label },
      tooltip: { trigger: 'axis', valueFormatter: (value: number | null) => money(value === null ? null : Math.round(value * 100)) },
      grid: { top: 20, left: 60, right: 15, bottom: 30 },
      xAxis: { type: 'category', data: points.map(p => p.date), boundaryGap: false, axisLine: { lineStyle: { color: '#395362' } }, axisLabel: { color: '#a4b8c2', fontSize: 10 } },
      yAxis: { type: 'value', scale: true, splitNumber: 3, axisLabel: { color: '#a4b8c2', formatter: (value: number) => `$${value.toFixed(0)}` }, splitLine: { lineStyle: { color: '#2b414e', type: 'dashed' } } },
      series: [{ type: 'line', data: points.map(p => p.cents === null ? null : p.cents / 100), connectNulls: false, smooth: false, symbol: 'circle', symbolSize: 5, lineStyle: { width: 3, color: '#74e2b1' }, itemStyle: { color: '#74e2b1' }, areaStyle: { color: '#74e2b1', opacity: 0.05 } }],
    })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)
    return () => { observer.disconnect(); chart.dispose() }
  }, [points, label])
  return <div className="trend-wrap">
    <div className="trend" ref={ref} role="img" aria-label={label} />
    <details className="data-table"><summary>View accessible chart data</summary><table><caption>{label}</caption><thead><tr><th>Date</th><th>USD estimate</th></tr></thead><tbody>{points.map(p => <tr key={p.date}><td>{p.date}</td><td>{p.cents === null ? 'No observation' : money(p.cents)}</td></tr>)}</tbody></table></details>
  </div>
}
