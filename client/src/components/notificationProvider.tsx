import { UndoOutlined } from "@ant-design/icons";
import { NotificationProvider, OpenNotificationParams } from "@refinedev/core";
import { Button, Progress, message } from "antd";

type UndoableNotificationProps = {
  notificationKey: OpenNotificationParams["key"];
  message: OpenNotificationParams["message"];
  cancelMutation: OpenNotificationParams["cancelMutation"];
  undoableTimeout: OpenNotificationParams["undoableTimeout"];
};

const UndoableNotification: React.FC<UndoableNotificationProps> = ({ message, cancelMutation, undoableTimeout }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: "-7px",
    }}
  >
    <Progress
      type="circle"
      percent={(undoableTimeout ?? 0) * 20}
      format={(time) => time && time / 20}
      size={50}
      strokeColor="#1890ff"
      status="normal"
    />
    <span style={{ marginLeft: 8, width: "100%" }}>{message}</span>
    <Button
      style={{ flexShrink: 0 }}
      onClick={cancelMutation}
      disabled={undoableTimeout === 0}
      icon={<UndoOutlined />}
    ></Button>
  </div>
);

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
