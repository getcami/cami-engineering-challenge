import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { CustomerRequest } from './customer-request.entity';

@Entity({ name: 'classification_events' })
  export class ClassificationEvent {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

  @Column({ name: 'request_id', type: 'uuid' })
    requestId!: string;

  @ManyToOne(() => CustomerRequest, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'request_id' })
    request!: CustomerRequest;

  @Column({ type: 'varchar', length: 32 })
    category!: string;

  @Column({ type: 'float' })
    confidence!: number;

  /** Snapshot of the message text at classification time */
  @Column({ type: 'text', name: 'message_snapshot' })
    messageSnapshot!: string;

  @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
