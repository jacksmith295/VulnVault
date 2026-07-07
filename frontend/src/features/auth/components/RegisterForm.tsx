import { EyeOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterForm() {
    return (
        <Card className="w-full max-w-md shadow-md">
            <CardHeader>
                <CardTitle className="text-4xl font-semibold">
                    Register for VulnVault
                </CardTitle>
                <CardDescription className="text-base">
                    Enter your details to get started with VulnVault
                </CardDescription>
            </CardHeader>

            <CardContent>
                <form className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            type="name"
                            placeholder="John"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="email@example.com"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>

                        <div className="relative">
                            <Input
                                id="password"
                                type="password"
                                className="pr-10"
                            />

                            <EyeOff
                                className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground cursor-pointer"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirm_password">Confirm Password</Label>

                        <div className="relative">
                            <Input
                                id="confirm_password"
                                type="password"
                                className="pr-10"
                            />

                            <EyeOff
                                className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground cursor-pointer"
                            />
                        </div>
                    </div>
                </form>
            </CardContent>

            <CardFooter className="grid grid-cols-2 gap-4">
                <Link href="/login" className="w-full">
                    <Button
                        variant="outline"
                        className="h-12 w-full rounded-xl text-lg"
                    >
                        Go to login
                    </Button>
                </Link>

                <Button className="h-12 rounded-xl text-lg">
                    Register
                </Button>
            </CardFooter>
        </Card>
    );
}