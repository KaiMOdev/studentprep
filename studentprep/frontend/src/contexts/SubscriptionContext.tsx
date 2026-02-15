import { createContext, useContext, type ReactNode } from "react";
import { useSubscription, type SubscriptionStatus } from "../hooks/useSubscription";

interface SubscriptionContextValue {
  subscription: SubscriptionStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
  isPro: boolean;
  isFree: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  subscription: null,
  loading: true,
  refresh: async () => {},
  isPro: false,
  isFree: true,
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const value = useSubscription();
  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptionContext() {
  return useContext(SubscriptionContext);
}
