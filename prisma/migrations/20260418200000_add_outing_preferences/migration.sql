-- Preferencias de salida (solo para el viewer; JSON privado).
ALTER TABLE "User" ADD COLUMN "outingPreferences" JSONB;
