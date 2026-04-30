import { CustomerChat } from "@/components/chat/CustomerChat";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-surface-primary text-text-primary">
      <CustomerChat />
    </main>
  );
}
