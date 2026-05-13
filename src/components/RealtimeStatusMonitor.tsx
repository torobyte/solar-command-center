import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ErrorDialog } from "@/components/ErrorDialog";

/**
 * Global realtime health watcher. Subscribes to a heartbeat channel and
 * surfaces an ErrorDialog when the connection drops or errors out.
 */
export function RealtimeStatusMonitor() {
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [details, setDetails] = useState<string | undefined>();
  const tokenRef = useRef(0);

  function connect() {
    tokenRef.current += 1;
    const token = tokenRef.current;
    const ch = supabase
      .channel(`heartbeat-${token}-${Math.random().toString(36).slice(2)}`)
      .subscribe((status, err) => {
        if (token !== tokenRef.current) return;
        if (status === "SUBSCRIBED") {
          setOpen(false);
          setRetrying(false);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setDetails(err?.message ?? `Estado: ${status}`);
          setOpen(true);
          setRetrying(false);
        }
      });
    return ch;
  }

  useEffect(() => {
    const ch = connect();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function retry() {
    setRetrying(true);
    // Force a brand new channel
    const ch = connect();
    // Safety timeout to clear retrying state if no callback fires
    setTimeout(() => setRetrying(false), 4000);
    return ch;
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
