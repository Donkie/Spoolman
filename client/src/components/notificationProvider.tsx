import { NotificationProvider } from "@refinedev/core";
import { message } from "antd";

import { UndoableNotification } from "@refinedev/antd/src/components/undoableNotification";

const SpoolmanNotificationProvider: NotificationProvider = {
  open: ({ key, message: content, type, cancelMutation, undoableTimeout }) => {
    if (type === "progress") {
      message.open({
        key,
        content: (
          <UndoableNotification
            notificationKey={key}
            message={content}
            cancelMutation={cancelMutation}
            undoableTimeout={undoableTimeout}
          />
        ),
        duration: 0,
      });
    } else {
      message.open({
        key,
        content,
        type,
      });
    }
  },
  close: (key) => message.destroy(key),
};

export default SpoolmanNotificationProvider;
