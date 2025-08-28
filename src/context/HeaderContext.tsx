import { ReactNode, createContext, useContext, useState } from "react";

type HeaderContextType = {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
};

const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

export const useHeader = () => {
  const context = useContext(HeaderContext);
  if (!context) {
    throw new Error("useHeader must be used within a HeaderProvider");
  }
  return context;
};

export const HeaderProvider = ({ children }: { children: ReactNode }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen);
  };

  return (
    <HeaderContext.Provider value={{ isSidebarOpen, toggleSidebar }}>
      {children}
    </HeaderContext.Provider>
  );
}; 