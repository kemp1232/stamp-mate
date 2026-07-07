import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Gift,
  LogIn,
  QrCode,
  ScanLine,
  ShieldCheck,
  Smartphone,
  UsersRound,
  WalletCards,
  Zap,
} from "lucide-react";
import { getCurrentUser } from "@/lib/authorization";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

const steps = [
  {
    icon: ClipboardList,
    title: "Create your loyalty program",
    body: "Set your reward rules in minutes. Example: buy 10 drinks, get 1 free classic milk tea.",
  },
  {
    icon: QrCode,
    title: "Display your store QR",
    body: "Print or show your QR code at the cashier so customers can scan it to join.",
  },
  {
    icon: Smartphone,
    title: "Customers get a personal QR card",
    body: "Each customer receives a digital stamp card they can save, screenshot, or bookmark.",
  },
  {
    icon: ScanLine,
    title: "Staff scans and adds stamps",
    body: "When a customer buys, staff scans the customer QR and taps Add Stamp.",
  },
  {
    icon: Gift,
    title: "Redeem rewards easily",
    body: "When the card is complete, staff marks the reward claimed and a new cycle begins.",
  },
];

const businesses = [
  "Cafes",
  "Milk tea shops",
  "Salons",
  "Barbershops",
  "Laundry shops",
  "Car wash shops",
  "Nail salons",
  "Pet grooming shops",
  "Small restaurants",
];

const benefits = [
  {
    icon: Smartphone,
    title: "No app install required",
    body: "Customers only need a browser. They can save their loyalty card link or QR code on their phone.",
  },
  {
    icon: Zap,
    title: "Faster for staff",
    body: "Staff can scan a customer QR and add a stamp in seconds.",
  },
  {
    icon: WalletCards,
    title: "Less lost cards",
    body: "Customers do not need to carry a paper stamp card.",
  },
  {
    icon: ShieldCheck,
    title: "Harder to fake",
    body: "Each customer card uses a unique QR code, and staff must be logged in to add stamps or redeem rewards.",
  },
  {
    icon: UsersRound,
    title: "Simple customer tracking",
    body: "See your loyal customers, total stamps given, and rewards claimed from one dashboard.",
  },
];

export default async function Home() {
  const user = await getCurrentUser();
  const primaryHref = user ? "/dashboard" : "/register";
  const primaryLabel = user ? "Go to dashboard" : "Create your digital card";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="relative isolate flex min-h-[86svh] overflow-hidden bg-background text-foreground">
        <Image
          src="/stampmate-hero.png"
          alt="Customer showing a QR loyalty card at a small shop counter"
          fill
          priority
          sizes="100vw"
          className="object-cover object-left-top"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/75 via-transparent to-transparent" />

        <div className="relative mx-auto flex w-full max-w-6xl flex-col px-5 py-5 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between gap-4">
            <Logo className="h-10 w-auto sm:h-12" />
            <nav className="flex items-center gap-2">
              {user ? (
                <Button
                  nativeButton={false}
                  render={<Link href="/dashboard" />}
                  className="h-10"
                >
                  Dashboard
                  <ArrowRight data-icon="inline-end" />
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    nativeButton={false}
                    render={<Link href="/login" />}
                    className="h-10 text-foreground hover:bg-muted"
                  >
                    <LogIn data-icon="inline-start" />
                    Log in
                  </Button>
                  <Button
                    nativeButton={false}
                    render={<Link href="/register" />}
                    className="hidden h-10 sm:inline-flex"
                  >
                    Register
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </>
              )}
            </nav>
          </header>

          <div className="flex flex-1 items-center py-12 sm:py-16">
            <div className="max-w-2xl">
              <p className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CheckCircle2 className="size-4" />
                QR-based loyalty cards for small businesses
              </p>
              <h1 className="text-5xl font-semibold leading-none tracking-normal sm:text-6xl lg:text-7xl">
                StampMate
              </h1>
              <p className="mt-5 max-w-xl text-2xl font-medium leading-tight sm:text-3xl">
                Digital loyalty cards for your suki customers.
              </p>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                Replace paper stamp cards with a simple QR-based loyalty card
                your customers can save on their phone. Customers scan your
                store QR, join your rewards program, and get their own personal
                loyalty card.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  nativeButton={false}
                  render={<Link href={primaryHref} />}
                  className="h-12 px-5 text-base"
                >
                  {primaryLabel}
                  <ArrowRight data-icon="inline-end" />
                </Button>
                {!user ? (
                  <Button
                    size="lg"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/login" />}
                    className="h-12 px-5 text-base"
                  >
                    Log in
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Keep customers coming back
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Simple rewards, better repeat visits.
            </h2>
          </div>
          <div className="space-y-5 text-base leading-7 text-muted-foreground sm:text-lg">
            <p>
              Paper stamp cards are easy to lose, forget, or fake. StampMate
              helps small businesses run a simple digital rewards program
              without needing a mobile app, POS integration, or complicated
              setup.
            </p>
            <p>
              Start with one simple offer: buy 10, get 1 free. Then let your
              customers keep coming back.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
            Scan, stamp, and reward in seconds.
          </h2>
        </div>

        <div className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {steps.map((step, index) => {
            const Icon = step.icon;

            return (
              <article
                key={step.title}
                className="rounded-[8px] border bg-card p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold leading-snug">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {step.body}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y bg-secondary text-secondary-foreground">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Built for small businesses
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Perfect for everyday repeat visits.
            </h2>
          </div>
          <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.map((business) => (
              <li key={business} className="flex items-center gap-3">
                <CheckCircle2
                  className="size-5 shrink-0 text-foreground"
                  aria-hidden="true"
                />
                <span>{business}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Why use StampMate?
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
            No paper cards. No manual tracking. No app install.
          </h2>
        </div>

        <div className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;

            return (
              <article
                key={benefit.title}
                className="rounded-[8px] border bg-card p-5"
              >
                <Icon className="size-6 text-foreground" aria-hidden="true" />
                <h3 className="mt-4 text-lg font-semibold">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {benefit.body}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-t bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-14 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold leading-tight">
              Create your digital loyalty card today.
            </h2>
            <p className="mt-3 text-muted-foreground">
              No app install. No complicated setup. Just scan, stamp, and
              reward.
            </p>
          </div>
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href={primaryHref} />}
            className="h-12 w-full px-5 text-base md:w-auto"
          >
            {primaryLabel}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </section>
    </main>
  );
}
