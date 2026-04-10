import usersData from "@/data/users.json";
import postsData from "@/data/posts.json";
import eventsData from "@/data/events.json";
import articlesData from "@/data/articles.json";
import relationshipsData from "@/data/relationships.json";
import type { Article, Event, Post, Relationship, User } from "@/types/models";

// Replace these JSON files with your own CMS/API source when real content is ready.
export const users = usersData as User[];
export const posts = postsData as Post[];
export const events = eventsData as Event[];
export const articles = articlesData as Article[];
export const relationships = relationshipsData as Relationship[];

export const userById = new Map(users.map((user) => [user.id, user]));
