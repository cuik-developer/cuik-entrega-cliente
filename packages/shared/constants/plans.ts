export const TRIAL_DURATION_DAYS = 7

export const DEFAULT_PLANS = [
  {
    name: "Trial",
    maxClients: 50,
    maxLocations: 1,
    maxPromos: 1,
    features: {},
  },
  {
    name: "Básico",
    maxClients: 200,
    maxLocations: 2,
    maxPromos: 3,
    features: { campaigns: false, analytics: true },
  },
  {
    name: "Pro",
    maxClients: 1000,
    maxLocations: 5,
    maxPromos: 10,
    features: { campaigns: true, analytics: true },
  },
]
