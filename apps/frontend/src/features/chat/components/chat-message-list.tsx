"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  ChatMessageContext,
  ChatMessagePage,
  ChatSummary,
  ChatViewMessage
} from "@/features/chat/types";
import {
  findFirstUnreadChatMessageIndex,
  preservePrependScrollTop,
  shouldObserveChatRead,
  shouldMarkChatRead
} from "@/features/chat/utils/chat-read-policy";
import { ChatMessageItem } from "./chat-message-item";

export function ChatMessageList({
  currentUserId,
  loadMessageContext,
  loadMessagePage,
  markRead,
  messages,
  onDelete,
  onRetry,
  summary,
  targetMessageId,
  workspaceId
}: {
  currentUserId: string;
  loadMessageContext: (
    messageId: string
  ) => Promise<ChatMessageContext | null>;
  loadMessagePage: (before?: string) => Promise<ChatMessagePage | null>;
  markRead: (messageId: string) => Promise<void>;
  messages: ChatViewMessage[];
  onDelete: (messageId: string) => Promise<void>;
  onRetry: (clientMessageId: string) => Promise<void>;
  summary: ChatSummary;
  targetMessageId: string | null;
  workspaceId: string;
}) {
  const pathname = usePathname();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const hasPositionedInitialScrollRef = useRef(false);
  const lastFocusedTargetRef = useRef<string | null>(null);
  const lastMarkedReadIdRef = useRef<string | null>(null);
  const targetPositionedRef = useRef(targetMessageId === null);
  const wasBottomVisibleRef = useRef(false);
  const [bottomVisible, setBottomVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [readObservationEpoch, setReadObservationEpoch] = useState(0);
  const firstUnreadIndex = useMemo(
    () =>
      findFirstUnreadChatMessageIndex(
        messages,
        summary.lastReadMessageId,
        summary.unreadCount
      ),
    [messages, summary.lastReadMessageId, summary.unreadCount]
  );

  useEffect(() => {
    hasPositionedInitialScrollRef.current = false;
    lastFocusedTargetRef.current = null;
    lastMarkedReadIdRef.current = null;
    setHistoryError(null);
    setNextCursor(null);
    let active = true;

    void loadMessagePage()
      .then((page) => {
        if (!active || !page) return;
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (active) setHistoryError("이전 메시지를 불러오지 못했습니다.");
      });

    return () => {
      active = false;
    };
  }, [loadMessagePage, workspaceId]);

  useEffect(() => {
    targetPositionedRef.current = targetMessageId === null;
    wasBottomVisibleRef.current = false;
    setBottomVisible(false);
    if (!targetMessageId) return;
    let active = true;
    setHistoryError(null);

    void loadMessageContext(targetMessageId)
      .then((context) => {
        if (!active || !context) return;
        if (!context.items.some(({ id }) => id === targetMessageId)) {
          setHistoryError("요청한 메시지를 찾을 수 없습니다.");
        }
      })
      .catch(() => {
        if (active) setHistoryError("요청한 메시지를 불러오지 못했습니다.");
      });

    return () => {
      active = false;
    };
  }, [loadMessageContext, targetMessageId]);

  useEffect(() => {
    const updateVisibility = () =>
      setDocumentVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    const root = scrollContainerRef.current;
    if (
      !sentinel ||
      !root ||
      !shouldObserveChatRead({
        targetMessageId,
        targetPositioned: targetPositionedRef.current
      })
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry?.isIntersecting === true;
        wasBottomVisibleRef.current = isVisible;
        setBottomVisible(isVisible);
      },
      { root, threshold: 0.9 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [readObservationEpoch, targetMessageId]);

  useEffect(() => {
    if (messages.length === 0) return;
    const scroller = scrollContainerRef.current;
    if (!scroller) return;

    if (!hasPositionedInitialScrollRef.current) {
      hasPositionedInitialScrollRef.current = true;
      if (!targetMessageId) {
        requestAnimationFrame(() => {
          scroller.scrollTop = scroller.scrollHeight;
        });
      }
      return;
    }

    if (wasBottomVisibleRef.current) {
      requestAnimationFrame(() => {
        scroller.scrollTop = scroller.scrollHeight;
      });
    }
  }, [messages.length, targetMessageId]);

  useEffect(() => {
    if (
      !targetMessageId ||
      lastFocusedTargetRef.current === targetMessageId ||
      !messages.some(({ id }) => id === targetMessageId)
    ) {
      return;
    }

    lastFocusedTargetRef.current = targetMessageId;
    setHighlightedMessageId(targetMessageId);
    setBottomVisible(false);
    wasBottomVisibleRef.current = false;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      document
        .getElementById(`chat-message-${targetMessageId}`)
        ?.scrollIntoView({ behavior: "auto", block: "center" });
      secondFrame = requestAnimationFrame(() => {
        targetPositionedRef.current = true;
        setReadObservationEpoch((currentEpoch) => currentEpoch + 1);
      });
    });
    const timeout = window.setTimeout(
      () => setHighlightedMessageId(null),
      3_000
    );
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.clearTimeout(timeout);
    };
  }, [messages, targetMessageId]);

  useEffect(() => {
    const latestMessage = [...messages].reverse().find(
      ({ delivery }) => delivery === "sent"
    );
    if (
      !latestMessage ||
      latestMessage.id === summary.lastReadMessageId ||
      latestMessage.id === lastMarkedReadIdRef.current ||
      !shouldMarkChatRead({
        pathname,
        documentVisible,
        bottomVisible
      })
    ) {
      return;
    }

    lastMarkedReadIdRef.current = latestMessage.id;
    void markRead(latestMessage.id).catch(() => {
      if (lastMarkedReadIdRef.current === latestMessage.id) {
        lastMarkedReadIdRef.current = null;
      }
    });
  }, [
    bottomVisible,
    documentVisible,
    markRead,
    messages,
    pathname,
    summary.lastReadMessageId
  ]);

  const loadOlderMessages = async () => {
    if (!nextCursor || isLoadingOlder) return;
    const scroller = scrollContainerRef.current;
    const previousMetrics = scroller
      ? {
          previousScrollHeight: scroller.scrollHeight,
          previousScrollTop: scroller.scrollTop
        }
      : null;

    setIsLoadingOlder(true);
    setHistoryError(null);
    try {
      const page = await loadMessagePage(nextCursor);
      if (!page) return;
      setNextCursor(page.nextCursor);
      if (scroller && previousMetrics) {
        requestAnimationFrame(() => {
          scroller.scrollTop = preservePrependScrollTop({
            ...previousMetrics,
            nextScrollHeight: scroller.scrollHeight
          });
        });
      }
    } catch {
      setHistoryError("이전 메시지를 불러오지 못했습니다.");
    } finally {
      setIsLoadingOlder(false);
    }
  };

  return (
    <div
      aria-label="Workspace 채팅 메시지"
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-4"
      ref={scrollContainerRef}
      role="log"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col">
        <div className="flex min-h-10 items-center justify-center">
          {nextCursor ? (
            <Button
              disabled={isLoadingOlder}
              onClick={() => void loadOlderMessages()}
              size="sm"
              type="button"
              variant="ghost"
            >
              {isLoadingOlder ? <Loader2 className="animate-spin" /> : null}
              이전 메시지 보기
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              대화의 시작입니다.
            </span>
          )}
        </div>

        {historyError ? (
          <p className="mx-3 my-2 rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {historyError}
          </p>
        ) : null}

        {messages.map((message, index) => {
          const previousMessage = messages[index - 1];
          const currentDate = formatMessageDate(message.createdAt);
          const showDateSeparator =
            !previousMessage ||
            formatMessageDate(previousMessage.createdAt) !== currentDate;

          return (
            <div key={message.id}>
              {showDateSeparator ? (
                <div
                  className="my-3 flex items-center gap-3 text-xs text-muted-foreground"
                  role="separator"
                >
                  <span className="h-px flex-1 bg-border" />
                  <span>{currentDate}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}

              {index === firstUnreadIndex ? (
                <div
                  className="my-2 flex items-center gap-3 text-xs font-medium text-primary"
                  role="separator"
                >
                  <span className="h-px flex-1 bg-primary/40" />
                  <span>새 메시지</span>
                  <span className="h-px flex-1 bg-primary/40" />
                </div>
              ) : null}

              <ChatMessageItem
                currentUserId={currentUserId}
                isHighlighted={highlightedMessageId === message.id}
                message={message}
                onDelete={onDelete}
                onRetry={onRetry}
              />
            </div>
          );
        })}

        <div
          aria-hidden="true"
          className="h-px"
          data-chat-bottom-sentinel
          ref={bottomSentinelRef}
        />
      </div>
    </div>
  );
}

const messageDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long",
  timeZone: "Asia/Seoul"
});

function formatMessageDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "날짜 정보 없음"
    : messageDateFormatter.format(date);
}
