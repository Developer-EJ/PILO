"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Bot, SendHorizontal, X } from "lucide-react";

export type CanvasAiChatAnchor = {
  x: number;
  y: number;
};

type CanvasAiChatOverlayProps = {
  anchor: CanvasAiChatAnchor | null;
  holdProgress: (CanvasAiChatAnchor & { progress: number }) | null;
  onClose: () => void;
};

type CanvasAiMessage = {
  content: string;
  role: "assistant" | "user";
};

export function CanvasAiChatOverlay({
  anchor,
  holdProgress,
  onClose,
}: CanvasAiChatOverlayProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<CanvasAiMessage[]>([
    {
      content:
        "캔버스에 관한 작업을 도와드릴게요. 저는 C를 꾹 누르면 어디서든 부를 수 있어요.",
      role: "assistant",
    },
  ]);
  const messageListEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messageListEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();

    if (!message) return;

    setMessages((currentMessages) => [
      ...currentMessages,
      { content: message, role: "user" },
    ]);
    setDraft("");
  }

  const panelStyle = anchor
    ? {
        left: Math.max(12, Math.min(anchor.x + 20, window.innerWidth - 372)),
        top: Math.max(12, Math.min(anchor.y + 20, window.innerHeight - 380)),
      }
    : undefined;

  return (
    <>
      {holdProgress ? (
        <div
          aria-label="Canvas AI 열기 진행 중"
          className="pointer-events-none fixed z-[70] grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow-lg"
          style={{
            left: holdProgress.x,
            top: holdProgress.y,
            background: `conic-gradient(#22d3ee ${holdProgress.progress * 360}deg, rgba(15, 23, 42, 0.9) 0deg)`,
          }}
        >
          <span className="grid size-9 place-items-center rounded-full bg-slate-950 text-cyan-200">
            <Bot className="size-4" />
          </span>
        </div>
      ) : null}

      {anchor ? (
        <section
          aria-label="Canvas AI 채팅"
          className="canvas-ai-chat fixed z-[70] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-2xl shadow-slate-950/20"
          style={panelStyle}
        >
          <header className="flex items-center justify-between border-b border-cyan-100 bg-cyan-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <span className="grid size-8 place-items-center rounded-full bg-slate-950 text-cyan-200">
                <Bot className="size-4" />
              </span>
              Canvas AI
            </div>
            <button
              aria-label="Canvas AI 채팅 닫기"
              className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-950"
              onClick={onClose}
              type="button"
            >
              <X className="size-4" />
            </button>
          </header>

          <div className="max-h-64 space-y-2 overflow-y-auto bg-white px-4 py-4 text-sm leading-6 text-slate-700 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {messages.map((message, index) => (
              <p
                key={`${message.role}-${index}`}
                className={
                  message.role === "assistant"
                    ? "w-fit max-w-[90%] rounded-xl rounded-tl-sm bg-slate-100 px-3 py-2"
                    : "ml-auto w-fit max-w-[90%] rounded-xl rounded-tr-sm bg-cyan-600 px-3 py-2 text-white"
                }
              >
                {message.content}
              </p>
            ))}
            <p className="text-xs text-slate-400">
              Canvas AI 응답 연결은 다음 단계에서 추가됩니다.
            </p>
            <div ref={messageListEndRef} />
          </div>

          <form className="flex gap-2 border-t border-slate-100 p-3" onSubmit={handleSubmit}>
            <input
              aria-label="Canvas AI 메시지"
              className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Canvas AI에게 물어보세요"
              value={draft}
            />
            <button
              aria-label="Canvas AI 메시지 보내기"
              className="grid size-10 place-items-center rounded-xl bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!draft.trim()}
              type="submit"
            >
              <SendHorizontal className="size-4" />
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
