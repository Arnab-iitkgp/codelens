import { Button } from "@/components/ui/button";
import Logout from "@/module/auth/components/logout";
import { requireAuth } from "@/module/auth/utils/auth-utils";

import Image from "next/image";

export default async function Home() {
  await requireAuth();
  return (
    
    
      <Logout className="min-h-screen flex items-center justify-center">
      <Button >Logout</Button>
      </Logout>
    
  );
}
