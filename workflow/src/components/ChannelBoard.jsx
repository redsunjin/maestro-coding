import { assignChannels } from '../lib/channels.js';

// 결정 채널 보드: 채널(레인)마다 대기 중인 결정 노트를 세로로 쌓는다.
// 터치 우선: 노트 전체가 44px 이상 탭 타깃, press 피드백(active:scale).
export default function ChannelBoard({ requests, channelCount = 4, onSelect }) {
  const channels = assignChannels(requests, channelCount);
  return (
    <div className="grid gap-3 p-4" style={{ gridTemplateColumns: `repeat(${channelCount}, minmax(0, 1fr))` }}>
      {channels.map((channelRequests, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl bg-slate-900/60 p-3 min-h-40">
          <div className="text-xs text-slate-400">
            채널 {index + 1}
            {channelRequests[0] ? ` · ${channelRequests[0].subjectType}` : ''}
          </div>
          {channelRequests.map((request) => (
            <button
              key={request.requestId}
              type="button"
              data-testid="decision-note"
              onClick={() => onSelect(request)}
              className="min-h-[44px] rounded-lg bg-slate-800 px-3 py-3 text-left transition active:scale-95"
            >
              <span className="mr-2 rounded bg-indigo-600/70 px-1.5 py-0.5 text-[10px] uppercase">
                {request.subjectType}
              </span>
              <span className="block mt-1 text-sm font-medium">{request.subject.title}</span>
              <span className="block text-xs text-slate-400">{request.actorId}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
