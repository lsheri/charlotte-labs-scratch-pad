import liamPhoto from "@/assets/team/liam.jpeg";
import ameliaPhoto from "@/assets/team/amelia.jpeg";
import kennethPhoto from "@/assets/team/kenneth.jpeg";
import tejashPhoto from "@/assets/team/tejash.jpeg";

export interface TeamMember {
  name: string;
  linkedin: string;
  photo: string;
}

export const TEAM: TeamMember[] = [
  { name: "Liam Sheridan", linkedin: "https://www.linkedin.com/in/liamsheridan510/", photo: liamPhoto },
  { name: "Amelia Cole", linkedin: "https://www.linkedin.com/in/ameliawcole/", photo: ameliaPhoto },
  { name: "Kenneth Kannampully", linkedin: "https://www.linkedin.com/in/kennethkannampully/", photo: kennethPhoto },
  { name: "Tejash Bagri", linkedin: "https://www.linkedin.com/in/tejash-bagri/", photo: tejashPhoto },
];
