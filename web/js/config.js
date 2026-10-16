/* Conexión con la base de datos de Diamond Travel en Supabase.
   Esta clave es PÚBLICA por diseño (publishable key): la seguridad la dan los permisos
   configurados en la base de datos (supabase/schema.sql). Nunca pongas aquí la clave secreta. */
window.DT_CONFIG = {
  supabaseUrl: "https://ugkvdoywkvmjftdngxim.supabase.co",
  supabaseKey: "sb_publishable_Yf3WinZRUrhYkHXsIq-f9A_RcghWZPL",
  supabaseJs: [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm",
    "https://esm.sh/@supabase/supabase-js@2.49.4"
  ]
};
