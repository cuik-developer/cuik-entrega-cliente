export const BUSINESS_TYPES = [
  { value: "veterinaria", label: "Veterinaria" },
  { value: "cafeteria", label: "Cafetería" },
  { value: "barberia", label: "Barbería" },
  { value: "restaurante", label: "Restaurante" },
  { value: "tienda", label: "Tienda" },
  { value: "gimnasio", label: "Gimnasio" },
  { value: "salon_belleza", label: "Salón de Belleza" },
  { value: "nail_bar", label: "Nail Bar" },
  { value: "pasteleria", label: "Pastelería" },
  { value: "autolavado", label: "Autolavado" },
  { value: "otro", label: "Otro" },
] as const

export type BusinessType = (typeof BUSINESS_TYPES)[number]["value"]
