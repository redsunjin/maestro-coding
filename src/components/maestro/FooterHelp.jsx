import React from 'react';

export default function FooterHelp() {
  return (
    <footer className="p-3 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 flex justify-between items-center z-10">
      <div>
        Tip: 떨어지는 노트를 <strong className="text-gray-300">클릭</strong>하여 코드 수정 내역(Diff)을 살짝 엿볼 수 있습니다.
      </div>
      <div className="flex space-x-4">
        <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1">1</kbd><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1">2</kbd><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">3</kbd> 프로젝트 전환</span>
        <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1 text-gray-300">D F J K</kbd> 승인</span>
        <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1 text-gray-300">Shift + D F J K</kbd> 반려(피드백)</span>
        <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1 text-gray-300">Ctrl+Z</kbd> 취소</span>
        <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1 text-gray-300">Tap</kbd> 하단 레인 버튼으로 승인/반려</span>
      </div>
    </footer>
  );
}
