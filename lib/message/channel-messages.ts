import type { Channel, ChannelMessage, MessageContent } from "@/types";

const definitions: Record<Channel, Array<Pick<ChannelMessage, "id" | "title" | "titleEn">>> = {
  LinkedIn: [
    { id: "linkedin-request", title: "LinkedIn 连接邀请", titleEn: "LinkedIn Connection Request" },
    { id: "linkedin-first-message", title: "连接通过后的第一封消息", titleEn: "First Message After Connecting" },
  ],
  Facebook: [
    { id: "facebook-first-contact", title: "Facebook 首次联系消息", titleEn: "Facebook First Contact Message" },
    { id: "facebook-follow-up", title: "对方回应或建立联系后的跟进消息", titleEn: "Facebook Follow-up Message" },
  ],
  Email: [
    { id: "email-subject", title: "Email 主题", titleEn: "Email Subject" },
    { id: "email-body", title: "第一封开发邮件", titleEn: "First Outreach Email" },
    { id: "email-follow-up", title: "建议的简短跟进邮件", titleEn: "Suggested Short Follow-up Email" },
  ],
  WhatsApp: [
    { id: "whatsapp-first-contact", title: "WhatsApp 首次联系消息", titleEn: "WhatsApp First Contact Message" },
    { id: "whatsapp-follow-up", title: "对方回复后的跟进消息", titleEn: "WhatsApp Follow-up Message" },
  ],
};

export const getChannelMessageDefinitions = (channel: Channel) => definitions[channel];

export function getChannelMessages(content: MessageContent, channel: Channel): ChannelMessage[] {
  if (content.messages?.length) return content.messages;
  const legacy = [
    { english: content.invitationEn || "", chinese: content.invitationZh || "" },
    { english: content.firstMessageEn || "", chinese: content.firstMessageZh || "" },
  ];
  return definitions[channel].slice(0, 2).map((definition, index) => ({ ...definition, ...legacy[index] }));
}

export function updateChannelMessage(content: MessageContent, channel: Channel, index: number, language: "english" | "chinese", value: string): MessageContent {
  const messages = getChannelMessages(content, channel).map((message, messageIndex) => messageIndex === index ? { ...message, [language]: value } : message);
  return {
    ...content,
    messages,
    invitationEn: messages[0]?.english || content.invitationEn,
    invitationZh: messages[0]?.chinese || content.invitationZh,
    firstMessageEn: messages[1]?.english || content.firstMessageEn,
    firstMessageZh: messages[1]?.chinese || content.firstMessageZh,
  };
}

export const formatMessageEnglish = (message: ChannelMessage) => `${message.titleEn}\n\n${message.english}`;

export const formatMessageBilingual = (message: ChannelMessage) => `${message.titleEn}\n\nEnglish:\n${message.english}\n\n中文：\n${message.chinese}`;

export const formatAllEnglish = (messages: ChannelMessage[]) => messages.map(formatMessageEnglish).join("\n\n---\n\n");

export const formatAllBilingual = (messages: ChannelMessage[]) => messages.map(formatMessageBilingual).join("\n\n---\n\n");

export function formatMessagesForFollowUpContext(content: MessageContent, channel: Channel) {
  return getChannelMessages(content, channel)
    .map(message => `${message.titleEn}:\n${message.english}\nChinese translation:\n${message.chinese}`)
    .join("\n\n");
}
