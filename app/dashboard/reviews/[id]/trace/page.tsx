import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { CheckCircle, XCircle, FileCode, ShieldAlert, Zap, Search, Activity, Scale } from "lucide-react";

export default async function TracePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const review = await prisma.review.findUnique({
    where: { id: params.id },
    include: { repository: true }
  });

  if (!review || !review.traceData) {
    return notFound();
  }

  const trace = review.traceData as any;
  const initialFindings = trace.initialFindings || [];
  const verifiedFindings = trace.verifiedFindings || [];
  const chunks = trace.chunks || [];

  return (
    <div className="container mx-auto py-10 space-y-8 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="h-8 w-8 text-blue-500" />
          Agent Trace Timeline
        </h1>
        <p className="text-muted-foreground mt-2">
          Transparent execution pipeline for PR #{review.prNumber} on {review.repository.fullName}
        </p>
      </div>

      {/* Step 1: Investigator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-purple-500" />
            Step 1: The Investigator (Context Retrieval)
          </CardTitle>
          <CardDescription>
            The deterministic agent parsed the PR diff and executed SQL Graph queries to find {chunks.length} impacted context chunks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="chunks">
              <AccordionTrigger>View Retrieved Context</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-4">
                  {chunks.map((chunk: any, i: number) => (
                    <div key={i} className="border rounded-md p-4 bg-muted/50">
                      <div className="flex items-center gap-2 mb-2">
                        <FileCode className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm font-semibold">{chunk.path}</span>
                        <Badge variant="outline" className="ml-auto">{chunk.type.toUpperCase()}</Badge>
                        {chunk.score && <Badge variant="secondary">Score: {chunk.score.toFixed(2)}</Badge>}
                      </div>
                      <pre className="text-xs bg-black/10 dark:bg-white/5 p-3 rounded-md overflow-x-auto">
                        <code>{chunk.content}</code>
                      </pre>
                    </div>
                  ))}
                  {chunks.length === 0 && <p className="text-sm text-muted-foreground">No context retrieved.</p>}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Step 2 & 3: Prosecutor and Defense Voting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-orange-500" />
            Step 2 & 3: Prosecutor & Defense Voting
          </CardTitle>
          <CardDescription>
            The Prosecutor proposed {initialFindings.length} initial findings. The 3 independent Defense Agents (Correctness, Security, Runtime) voted to verify or drop each finding to eliminate false positives.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initialFindings.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Initial Claim</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-center">Vote Result</TableHead>
                  <TableHead className="text-right">Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialFindings.map((finding: any, i: number) => {
                  const verifiedMatch = verifiedFindings.find((v: any) => v.claim === finding.claim);
                  const isKept = !!verifiedMatch;
                  
                  return (
                    <TableRow key={i} className={isKept ? "" : "opacity-60 bg-red-500/5 dark:bg-red-500/10"}>
                      <TableCell className="font-medium">
                        <div className="line-clamp-2 text-sm">{finding.claim}</div>
                      </TableCell>
                      <TableCell>
                        <a 
                          href={`https://github.com/${review.repository.fullName}/blob/main/${finding.file}#L${finding.startLine}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-blue-500 hover:underline inline-flex items-center gap-1"
                        >
                          {finding.file}:{finding.startLine}
                        </a>
                      </TableCell>
                      <TableCell className="text-center">
                        {isKept ? (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                            {verifiedMatch.confidence || "Verified"}
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Rejected</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isKept ? (
                          <span className="text-green-600 dark:text-green-400 font-semibold text-sm flex items-center justify-end gap-1">
                            <CheckCircle className="h-4 w-4" /> Kept
                          </span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 font-semibold text-sm flex items-center justify-end gap-1">
                            <XCircle className="h-4 w-4" /> Dropped
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No initial findings were proposed.</p>
          )}
        </CardContent>
      </Card>

      {/* Step 4: The Judge (Final Output) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Step 4: The Judge (Final Output)
          </CardTitle>
          <CardDescription>
            The surviving {verifiedFindings.length} findings were grounded against the Git diff and posted to GitHub.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {verifiedFindings.map((finding: any, i: number) => (
              <div key={i} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex gap-2 items-center mb-1">
                  <Badge variant="outline">{finding.category}</Badge>
                  <span className="text-xs font-mono text-muted-foreground">{finding.file}:{finding.startLine}-{finding.endLine}</span>
                </div>
                <p className="text-sm font-semibold">{finding.claim}</p>
                <p className="text-sm text-muted-foreground mt-1">{finding.suggestion}</p>
              </div>
            ))}
            {verifiedFindings.length === 0 && (
              <p className="text-sm text-muted-foreground">No findings survived the verification pass. A clean bill of health was posted! 🎉</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
