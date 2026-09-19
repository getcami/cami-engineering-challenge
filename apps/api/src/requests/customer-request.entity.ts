import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RequestNote } from './request-note.entity';

export const REQUEST_STATUSES = ['open', 'in_progress', 'resolved'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

@Entity({ name: 'customer_requests' })
export class CustomerRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'varchar', length: 32, default: 'open' })
  status!: RequestStatus;

  @Column({ type: 'varchar', length: 32, nullable: true })
  category!: string | null;

  @Column({ type: 'float', nullable: true })
  confidence!: number | null;

  @OneToMany(() => RequestNote, (note) => note.request)
  notes!: RequestNote[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
