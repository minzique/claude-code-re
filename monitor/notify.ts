#!/usr/bin/env bun
import { formatDiffTelegram, type DiffResult } from "./diff-signatures"

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

export async function sendTelegram(message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("[notify] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set, printing to stdout:")
    console.log(message)
    return false
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  })

  if (!res.ok) {
    console.error(`[notify] Telegram API error: ${res.status} ${await res.text()}`)
    return false
  }

  console.log("[notify] Telegram message sent")
  return true
}

export async function notifyNewVersion(version: string, diff?: DiffResult) {
  let message: string

  if (diff?.hasChanges) {
    message = formatDiffTelegram(diff)
  } else if (diff && !diff.hasChanges) {
    message = `📦 <b>Claude Code ${version}</b> released — no API signature changes detected`
  } else {
    message = `📦 <b>Claude Code ${version}</b> released — analysis pending`
  }

  await sendTelegram(message)
}

if (import.meta.main) {
  const message = process.argv[2] || "Test notification from claude-code-re monitor"
  await sendTelegram(message)
}
