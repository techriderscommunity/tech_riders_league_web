import { redirect } from "next/navigation";

export default function HackathonPage() {
  redirect("/eventos?etapa=hackathon#detalle-etapa");
}
