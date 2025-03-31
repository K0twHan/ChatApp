"use client";
import { useState } from "react";
import { useRouter } from "next/navigation"; // Updated import
import Image from "next/image";

export default function Index() {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch("http://localhost:9900/auth/LogIn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error("Login failed");
      }

      const data = await response.json();
      localStorage.setItem("token", data.access_token);
      setShowLoginModal(false);
      router.push("/chatPage"); // Ensure this path is correct
    } catch {
      setError("Giriş başarısız. Lütfen bilgilerinizi kontrol edin.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 pb-20 gap-4 sm:p-20 font-[family-name:var(--font-geist-sans)] bg-gray-50">
      <header className="w-full flex justify-between items-center p-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md">
        <h1 className="text-2xl font-bold">Projemize Hoş Geldiniz</h1>
        <Image
          className="rounded-full"
          src="/logo.png"
          alt="Proje Logosu"
          width={40}
          height={40}
        />
      </header>
      <main className="flex flex-col items-center w-full max-w-2xl bg-white shadow-lg rounded-lg p-8 mt-8">
        <h2 className="text-3xl font-bold mb-4 text-gray-800">Projemiz Hakkında</h2>
        <p className="text-center mb-8 text-gray-600">
          Bu proje, harika bir sohbet deneyimi sunmak için tasarlandı. Arkadaşlarınız ve ailenizle bağlantı kurabilir, mesajlar paylaşabilir ve iletişimde kalabilirsiniz.
        </p>
        <div className="flex gap-4">
          <button
            className="rounded-full bg-blue-600 text-white transition-colors flex items-center justify-center hover:bg-blue-700 font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5"
            onClick={() => setShowLoginModal(true)}
          >
            Giriş Yap
          </button>
          <a
            className="rounded-full bg-green-600 text-white transition-colors flex items-center justify-center hover:bg-green-700 font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5"
            href="/signup"
          >
            Kayıt Ol
          </a>
        </div>
      </main>

      {showLoginModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Giriş Yap</h2>
            <form className="flex flex-col gap-4" onSubmit={handleLogin}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Şifre
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Giriş Yap
              </button>
            </form>
            <button
              className="mt-4 text-gray-600 hover:underline"
              onClick={() => setShowLoginModal(false)}
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
