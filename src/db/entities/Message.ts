import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Conversation } from "./Conversation";
import type { MessageRole } from "../types";

@Entity("messages")
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "conversation_id" })
  conversationId!: string;

  @ManyToOne(() => Conversation, (c) => c.messages, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation!: Relation<Conversation>;

  @Column({ type: "varchar", length: 20 })
  role!: MessageRole;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "jsonb", nullable: true, name: "tool_calls" })
  toolCalls!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;
}
