export interface ITask {
  id: string;
  title: string;
  description?: string;
  assignedUserId?: string;
  // Add other task properties as needed
}
