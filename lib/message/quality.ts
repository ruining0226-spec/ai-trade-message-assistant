import type { Channel, OptimizableMessage } from "@/types";

const englishWordPattern = /[A-Za-z]+(?:[-'][A-Za-z]+)*/g;
const unsafeClaimPattern = /\b(?:lowest price|best quality|guaranteed delivery|guaranteed lead time|exclusive (?:agency|rights)|we guarantee|definitely certified)\b/i;

export function englishWordCount(value: string) {
  return value.match(englishWordPattern)?.length || 0;
}

export function questionCount(value: string) {
  return (value.match(/\?/g) || []).length;
}

export function isSafeConnectionInvitation(value: string) {
  return [...value].length <= 300 && questionCount(value) <= 1 && !unsafeClaimPattern.test(value) && !/dear friend/i.test(value);
}

export function isSafeFirstOutreach(value: string, detailed = false) {
  const words = englishWordCount(value);
  return words >= 80 && (detailed || words <= 160) && questionCount(value) <= 1 && !unsafeClaimPattern.test(value) && !/dear friend/i.test(value);
}

export function optimizedMessagesPassQuality(channel: Channel, messages: OptimizableMessage[], detailed = false) {
  if (messages.some(message => unsafeClaimPattern.test(message.english) || /dear friend/i.test(message.english))) return false;
  if (channel === "LinkedIn") {
    const invitation = messages.find(message => message.id === "linkedin-request");
    const first = messages.find(message => message.id === "linkedin-first-message");
    if (invitation && !isSafeConnectionInvitation(invitation.english)) return false;
    if (first && !isSafeFirstOutreach(first.english, detailed)) return false;
  }
  const primary = messages.find(message => message.id === "email-body" || message.id.endsWith("first-contact"));
  return !primary || isSafeFirstOutreach(primary.english, detailed);
}
