import { useQuery } from "@tanstack/react-query";
import { Spin, Typography } from "antd";
import { getAPIURL } from "../utils/url";

const { Text } = Typography;

interface IInfo {
  version: string;
  debug_mode: boolean;
  automatic_backups: boolean;
  data_dir: string;
  backups_dir: string;
  db_type: string;
  git_commit?: string;
  build_date?: string;
}

export const Version: React.FC = () => {
  const infoResult = useQuery<IInfo>({
    queryKey: ["info"],
    queryFn: async () => {
      const response = await fetch(getAPIURL() + "/info");
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
  });

  if (infoResult.isLoading) {
    return <Spin />;
  }

  if (infoResult.isError) {
    return <span>Unknown</span>;
  }

  const info = infoResult.data;
  const commit_suffix = info.git_commit ? <Text type="secondary">{` (${info.git_commit})`}</Text> : <></>;
  return (
    <span title={info.build_date}>
      {info.version}
      {commit_suffix}
    </span>
  );
};
