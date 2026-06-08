import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ErrorDialog } from "@/components/ErrorDialog";

/**
 * Global realtime health watcher.
 *
 * Realtime channels frequently bounce (token refresh, mobile network swap,
 * tab backgrounded). We debounce the error dialog so transient drops never
 * surface to the user — only show after sustained downtime, and auto-reconnect
 * silently in the background.
 */
export function RealtimeStatusMonitor() {
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [details, setDetails] = useState<string | undefined>();
  const tokenRef = useRef(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const downTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastConnectRef = useRef(0);

  const SUSTAINED_DOWN_MS = 20_000; // only warn after 20s of being down

  function clearDownTimer() {
    if (downTimerRef.current) {
      clearTimeout(downTimerRef.current);
      downTimerRef.current = null;
    }
  }
  function clearReconnect() {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }

  function scheduleReconnect(delayMs: number) {
    clearReconnect();
    reconnectTimerRef.current = setTimeout(() => {
      connect();
    }, delayMs);
  }

  function connect() {
    const now = Date.now();
    if (now - lastConnectRef.current < 10_000) return channelRef.current ?? undefined;
    lastConnectRef.current = now;
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
    }
    tokenRef.current += 1;
    const token = tokenRef.current;
    const ch = supabase
      .channel(`heartbeat-${token}-${Math.random().toString(36).slice(2)}`)
      .subscribe((status, err) => {
        if (token !== tokenRef.current) return;
        if (status === "SUBSCRIBED") {
          clearDownTimer();
          clearReconnect();
          setOpen(false);
          setRetrying(false);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          // Always try to reconnect silently first
          scheduleReconnect(3000);
          // Only surface dialog if it stays down for a while
          if (!downTimerRef.current) {
            downTimerRef.current = setTimeout(() => {
              setDetails(err?.message ?? `Estado: ${status}`);
              setOpen(true);
              setRetrying(false);
            }, SUSTAINED_DOWN_MS);
          }
        }
      });
    channelRef.current = ch;
    return ch;
  }

  useEffect(() => {
    connect();
    const onOnline = () => connect();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!channelRef.current) connect();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearDownTimer();
      clearReconnect();
      if (channelRef.current) {
        try { supabase.removeChannel(channelRef.current); } catch {}
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function retry() {
    setRetrying(true);
    connect();
    setTimeout(() => setRetrying(false), 4000);
  }

  return (
    <ErrorDialog
      open={open}
      onOpenChange={setOpen}
      kind="realtime"
      details={details}
      retrying={retrying}
      onRetry={retry}
    />
  );
}
