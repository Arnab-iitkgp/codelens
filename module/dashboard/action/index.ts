"use server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  fetchUserContributions,
  getAccessToken,
} from "@/module/github/lib/github";
import { headers } from "next/headers";
import { Octokit } from "octokit";
import { date } from "zod";

export async function getDashboardStats() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw new Error("Unauthorized");
    }
    const token = await getAccessToken();
    console.log(token);
    const octokit = new Octokit({ auth: token });

    // get users username of github
    const { data: user } = await octokit.rest.users.getAuthenticated();
 //TODO: fetch total and connected repos from db
    const totalRepos =user.public_repos + (user.owned_private_repos ?? 0)
    const calendar = await fetchUserContributions(token, user.login as string);
    const totalCommits = calendar?.totalContributions || 0;
    const connectedRepos =await prisma.repository.count({
        where:{
            userId:session.user.id
        }
    })

    // count prs from db or github
    const { data: prs } = await octokit.rest.search.issuesAndPullRequests({
      q: `author:${user.login} type:pr`,
      per_page: 1,
    });
    const totalPRs = prs.total_count;
    
    //TODO: count AI reviwes from db

    const totalReviews = await prisma.review.count({
      where: {
        repository: {
          userId: session.user.id, 
        },
      },
    });

    return {
      totalCommits,
      totalPRs,
      totalRepos,
      totalReviews,
      connectedRepos
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return {
      totalCommits: 0,
      totalPRs: 0,
      totalRepos: 0,
      totalReviews: 0,
      connectedRepos:0
    };
  }
}

export async function getMonthlyActivity() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      throw new Error("Unauthorized");
    }
    const token = await getAccessToken();
    const octokit = new Octokit({ auth: token });

    // get users username of github
    const { data: user } = await octokit.rest.users.getAuthenticated();

    const calendar = await fetchUserContributions(token, user.login);
    if (!calendar) {
      return [];
    }
    //group contributions by month
    const monthlyData: {
      [key: string]: { commits: number; prs: number; reviews: number };
    } = {};
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = monthNames[date.getMonth()];
      monthlyData[monthKey] = { commits: 0, prs: 0, reviews: 0 };
    }
    calendar.weeks.forEach((week) => {
      week.contributionDays.forEach((day) => {
        const date = new Date(day.date);
        const monthKey = monthNames[date.getMonth()];
        if (monthlyData[monthKey]) {
          monthlyData[monthKey].commits += day.contributionCount;
        }
      });
    });

    // fetch reviews from db for last 6 months and group by month
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    //TODO: reviews real data, now sample data
    const generateSampleReviews = () => {
      const sampleReviews = [];
      const now = new Date();

      // Generate random reviews over the past 6 months
      for (let i = 0; i < 45; i++) {
        const randomDaysAgo = Math.floor(Math.random() * 180); // Random day in last 6 months
        const reviewDate = new Date(now);
        reviewDate.setDate(reviewDate.getDate() - randomDaysAgo);

        sampleReviews.push({
          createdAt: reviewDate,
        });
      }

      return sampleReviews;
    };

    const reviews = generateSampleReviews();
    reviews.forEach((review) => {
      const monthKey = monthNames[review.createdAt.getMonth()];
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].reviews += 1;
      }
    });

    const { data: prs } = await octokit.rest.search.issuesAndPullRequests({
      q: `author:${user.login} type:pr created:>${
        sixMonthsAgo.toISOString().split("T")[0]
      }`,
      per_page: 100,
    });

    prs.items.forEach((pr: any) => {
      const date = new Date(pr.created_at);
      const monthKey = monthNames[date.getMonth()];
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].prs += 1;
      }
    });

    return Object.keys(monthlyData).map((name) => ({
      name,
      ...monthlyData[name],
    }));
  } catch (error) {
    console.error("Error fetching monthly activity:", error);
    return [];
  }
}
function getLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 10) return 3
  return 4
}

export async function getConrtibutionStats() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) {
      throw new Error("Unauthorized");
    }
    const token = await getAccessToken();
    const octokit = new Octokit({ auth: token });

    const { data: user } = await octokit.rest.users.getAuthenticated();
    const calendar = await fetchUserContributions(token, user.login);
    if (!calendar) {
      return null;
    }
    const contributions = calendar.weeks.flatMap((week) =>
      week.contributionDays.map((day) => ({
        date: day.date,
        count: day.contributionCount,
        level: getLevel(day.contributionCount)
      }))
    );
    return {
      contributions,
      totalContributions: calendar.totalContributions,
    };
  } catch (error) {
    console.error("Error fetching contribution stats:", error);
    return null;
  }
}
