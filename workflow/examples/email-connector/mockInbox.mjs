// 목 받은편지함 드라이버 (스펙 2026-08-04 데모 §1): 자격증명 없이 전체 루프를 증명한다.
// 실제 IMAP/Gmail 드라이버는 이 인터페이스(listUnprocessed/send/markProcessed)만 맞추면 된다.

export function createMockInboxDriver(seedMails = null) {
  const mails = seedMails || [
    {
      id: 'mail-1',
      from: 'client@corp.com',
      subject: '견적 회신 요청',
      body: '지난주 논의한 범위로 견적 부탁드립니다.',
      proposedAction: '표준 견적 템플릿으로 회신',
      draftReply: '안녕하세요, 요청하신 견적을 첨부와 같이 회신드립니다. 감사합니다.',
    },
    {
      id: 'mail-2',
      from: 'partner@vendor.io',
      subject: '미팅 일정 조율',
      body: '다음 주 수요일 오후 가능하신가요?',
      proposedAction: '수요일 15시로 수락 회신',
      draftReply: '안녕하세요, 수요일 15시 좋습니다. 초대장 보내주시면 참석하겠습니다.',
    },
  ];
  const processed = new Set();
  const sent = [];

  return {
    sent,
    listUnprocessed() {
      return mails.filter((mail) => !processed.has(mail.id));
    },
    send({ to, subject, body }) {
      sent.push({ to, subject, body });
    },
    markProcessed(mailId) {
      processed.add(mailId);
    },
  };
}
