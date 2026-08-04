import { getPlayerCopy } from '../lib/playerI18n.js';

const DECK_TABS = ['source', 'play', 'session', 'records'];

// 빈티지 오디오 소스 셀렉터 스타일의 덱 탭. LED는 각 탭의 준비 상태를 나타낸다.
export default function PlayerDeckTabs({ activeTab, onSelect, indicators = {}, language = 'en' }) {
  const copy = getPlayerCopy(language);

  return (
    <div className="player-deck-tabs" role="tablist" aria-label={copy.deckTabs.ariaLabel}>
      {DECK_TABS.map((tab) => {
        const isActive = activeTab === tab;
        const isLit = tab === 'source' ? true : Boolean(indicators[tab]);
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`player-deck-tab${isActive ? ' player-deck-tab--active' : ''}`}
            onClick={() => onSelect?.(tab)}
          >
            <span
              className={`player-deck-tab__led${isLit ? ' player-deck-tab__led--on' : ''}`}
              aria-hidden="true"
            />
            <span className="player-deck-tab__label">{copy.deckTabs[tab]}</span>
          </button>
        );
      })}
    </div>
  );
}
