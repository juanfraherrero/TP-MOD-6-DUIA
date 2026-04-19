import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from "typeorm";
import type { Relation } from "typeorm";
import { Message } from "./Message";
import type { ConversationRole } from "../types";

@Entity("conversations")
export class Conversation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100, name: "session_id" })
  sessionId!: string;

  @Column({ type: "varchar", length: 20 })
  role!: ConversationRole;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @OneToMany(() => Message, (m) => m.conversation, { cascade: true })
  messages!: Relation<Message>[];
}
