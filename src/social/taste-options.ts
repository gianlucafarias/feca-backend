export const TASTE_OPTIONS = [
  { id: "small_bar", label: "Te gustan las barras chicas" },
  {
    id: "specialty_over_brunch",
    label: "Preferis specialty sobre brunch masivo",
  },
  { id: "reading_spots", label: "Buscas lugares para leer" },
  { id: "wifi_outlets", label: "Te importan wifi y enchufes" },
  { id: "terrace", label: "Preferis terrazas" },
  { id: "indoor_table", label: "Preferis mesas de interior" },
  { id: "quiet", label: "Valoras lugares tranquilos" },
  { id: "bright_light", label: "Te importa la luz natural" },
] as const;

export const TASTE_OPTION_IDS = new Set<string>(
  TASTE_OPTIONS.map((option) => option.id),
);
