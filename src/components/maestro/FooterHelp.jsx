import React from 'react';
import { formatLaneKeyLabel } from '../../constants/maestro.js';

export default function FooterHelp({ lanes = [] }) {
  const laneKeys = lanes
    .map((lane) => formatLaneKeyLabel(lane.key))
    .filter(Boolean)
    .join(' ');

  return (
    <footer className="p-3 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 flex justify-between items-center gap-3 z-10">
      <div className="min-w-0">
        <span className="hidden md:inline">
          Tip: 떨어지는 노트를 <strong className="text-gray-300">클릭</strong>하여 코드 수정 내역(Diff)을 살짝 엿볼 수 있습니다.
        </span>
        {/* 좁은 화면(터치): 키보드 힌트 대신 탭 안내 한 줄만 */}
        <span className="md:hidden">
          Tip: 노트를 <strong className="text-gray-300">탭</strong>하면 Diff, 하단 레인 버튼으로 승인/반려.
        </span>
      </div>
      <div className="hidden md:flex space-x-4">
        <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1">1</kbd><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1">2</kbd><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">3</kbd> 프로젝트 전환</span>
        <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1 text-gray-300">{laneKeys || 'Click'}</kbd> 승인</span>
        <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1 text-gray-300">Shift + {laneKeys || 'Click'}</kbd> 반려(피드백)</span>
        <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1 text-gray-300">Ctrl+Z</kbd> 취소</span>
        <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1 text-gray-300">H</kbd> 히스토리 패널</span>
        <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1 text-gray-300">Tap</kbd> 하단 레인 버튼으로 승인/반려</span>
      </div>
    </footer>
  );
}
