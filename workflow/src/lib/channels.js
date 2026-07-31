// 레인 = 결정 채널. subjectType을 최초 등장 순서로 채널에 라운드로빈 배정한다.
export function assignChannels(requests, channelCount = 4) {
  const channels = Array.from({ length: channelCount }, () => []);
  const typeToChannel = new Map();
  for (const request of requests) {
    const type = request.subjectType || 'generic';
    if (!typeToChannel.has(type)) {
      typeToChannel.set(type, typeToChannel.size % channelCount);
    }
    channels[typeToChannel.get(type)].push(request);
  }
  return channels;
}
