export async function getSkillContent(id: string): Promise<string> {
  const response = await fetch(`/api/skills/${encodeURIComponent(id)}/content`)
  const payload = await response.json().catch(() => ({})) as { content?: string; error?: string }
  if (!response.ok) throw new Error(payload.error || 'Failed to read skill')
  return payload.content || ''
}
