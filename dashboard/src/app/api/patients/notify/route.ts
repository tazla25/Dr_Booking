import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { notifyPatients } from '@/lib/bot-notify'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { chatIds, text, template } = body

    if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0 || !text) {
      return NextResponse.json({ error: 'Invalid input: chatIds (array) and text required' }, { status: 400 })
    }

    const result = await notifyPatients(chatIds, text, template)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[api/patients/notify] Error:', error)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
