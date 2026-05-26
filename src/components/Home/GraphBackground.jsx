import GraphCanvas from './GraphCanvas.jsx'

export default function GraphBackground({ data }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.62,
        filter: 'blur(0.6px) brightness(0.9)',
      }}
    >
      <GraphCanvas data={data} interactive={false} />
    </div>
  )
}
