"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) {
          router.push("/login");
        } else {
          setChecking(false);
        }
      })
      .catch(() => router.push("/login"));
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">Your Kits</h1>
          <a
            href="/kits/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            + New Kit
          </a>
        </div>
        <p className="text-gray-500">No kits yet — create your first one above.</p>
      </div>
    </div>
  );
}