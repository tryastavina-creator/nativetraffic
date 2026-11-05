import { redirect } from "next/navigation";

/** Campaign creation now lives in the Tráfego tab. */
export default function Campanhas() {
  redirect("/trafego");
}
