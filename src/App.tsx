import { useEffect } from "react";
import { useEPGStore } from "./common/store/epgStore";
import EPGModal from "./common/components/EPGModal";
import { fetchEPG } from "./common/services/epgService";

export const App = () => {
  const open = useEPGStore(s => s.open);
  const modalOpen = useEPGStore(s => s.modalOpen);
  const setChannels = useEPGStore(s => s.setChannels);

  useEffect(() => {
    // Pre-fetch in background once (improves UX)
    let cancelled = false;
    (async () => {
      const channels = await fetchEPG();
      if (!cancelled) setChannels(channels);
    })();
    return () => { cancelled = true; };
  }, [setChannels]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <button
        className="px-6 py-3 bg-black text-white rounded"
        onClick={open}
        aria-label="Mostrar EPG"
      >
        Mostrar EPG
      </button>

      {modalOpen && <EPGModal />}
    </div>
  );
}
