const ARTIFACT_TYPES = [
  { id: 'html',   regex: /```html\n([\s\S]*?)```/g,              previewable: true,  label: 'HTML'       },
  { id: 'svg',    regex: /```svg\n([\s\S]*?)```/g,               previewable: true,  label: 'SVG'        },
  { id: 'css',    regex: /```css\n([\s\S]*?)```/g,               previewable: false, label: 'CSS'        },
  { id: 'js',     regex: /```(?:javascript|js)\n([\s\S]*?)```/g, previewable: false, label: 'JavaScript' },
  { id: 'python', regex: /```python\n([\s\S]*?)```/g,            previewable: false, label: 'Python'     },
  { id: 'json',   regex: /```json\n([\s\S]*?)```/g,              previewable: false, label: 'JSON'       },
]

export function parseArtifacts(text) {
  const artifacts = []
  let idx = 0

  for (const { id, regex, previewable, label } of ARTIFACT_TYPES) {
    regex.lastIndex = 0
    let match
    while ((match = regex.exec(text)) !== null) {
      artifacts.push({
        id: `${id}-${idx++}`,
        type: id,
        label,
        content: match[1],
        previewable,
        startIndex: match.index,
      })
    }
  }

  artifacts.sort((a, b) => a.startIndex - b.startIndex)
  return artifacts
}

// Retorna true se há um bloco de código aberto sem fechar (streaming em andamento)
export function hasOpenCodeBlock(text) {
  const parts = text.split('```')
  return parts.length % 2 === 0
}

export function getPreviewableArtifacts(text) {
  return parseArtifacts(text).filter(a => a.previewable)
}
