import type { Metadata } from "next"
import { FaroBoard } from "@/components/faro-board"

export const metadata: Metadata = {
  title: "Faro da Roteirização | Routing Clock First Mile",
  description: "Acompanhamento em tempo real das roteirizações por HUB e tipo (W-1, D-1, D-2).",
}

export default function FaroPage() {
  return <FaroBoard />
}
