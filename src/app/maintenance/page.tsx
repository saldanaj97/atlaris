import { ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-5">
      <Card className="max-w-2xl w-full text-center">
        <CardContent className="space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="bg-main rounded-full p-5 animate-pulse border-2 border-border shadow-shadow">
              <ShieldAlert className="w-10 h-10 text-main-foreground" />
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex justify-center">
            <Badge className="gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-main-foreground opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-main-foreground"></span>
              </span>
              System Maintenance in Progress
            </Badge>
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-heading text-foreground">
            We're Currently Under Maintenance
          </h1>

          {/* Subtitle */}
          <p className="text-lg text-foreground opacity-70">
            Our platform is temporarily unavailable while we perform important
            updates and improvements.
          </p>

          {/* Message Box */}
          <Card className="text-left">
            <CardContent className="space-y-4">
              <p className="text-foreground leading-relaxed">
                We sincerely apologize for any inconvenience this may cause.
                Our team is actively working on critical fixes and system
                enhancements to improve your experience.
              </p>
              <p className="text-foreground leading-relaxed">
                <span className="text-main font-semibold">Good news:</span> We're
                in the process of migrating to a zero-downtime infrastructure.
                Once complete, future updates will occur seamlessly without
                interrupting your service.
              </p>
              <p className="text-foreground leading-relaxed">
                We appreciate your patience and understanding as we work to make
                Atlaris better for you.
              </p>
            </CardContent>
          </Card>
        </CardContent>

        {/* Footer */}
        <CardFooter className="flex-col gap-2 border-t-2 border-border text-center">
          <p className="text-foreground opacity-60 text-sm">
            Expected to be back online shortly
          </p>
          <p className="text-foreground opacity-60 text-sm">
            If you have urgent questions, please contact our support team
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
