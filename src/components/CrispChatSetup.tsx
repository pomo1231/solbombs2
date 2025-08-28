import { useEffect } from "react";

type Props = {
  enabled: boolean;
};

const CrispChatSetup = ({ enabled }: Props) => {
  useEffect(() => {
    const w = window as any;
    const crispWebsiteId = "d873730a-7084-4211-8bcb-e7044b539b6a";

    if (enabled) {
      // Initialize Crisp if not already loaded
      if (!w.CRISP_WEBSITE_ID) {
        w.CRISP_WEBSITE_ID = crispWebsiteId;
        w.$crisp = w.$crisp || [];
        const script = document.createElement("script");
        script.src = "https://client.crisp.chat/l.js";
        script.async = true;
        document.head.appendChild(script);
      } else {
        // If already loaded, ensure it's visible
        if (w.$crisp) {
          try {
            w.$crisp.push(["do", "chat:show"]);
          } catch {}
        }
      }
    } else {
      // Hide the widget when not enabled
      if (w.$crisp) {
        try {
          w.$crisp.push(["do", "chat:close"]);
          w.$crisp.push(["do", "chat:hide"]);
        } catch {}
      }
    }
  }, [enabled]);

  return null;
};

export default CrispChatSetup;